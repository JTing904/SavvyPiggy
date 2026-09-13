
export interface PiggyBank {
  id: string;
  name: string;
  /** 0 means the goal is open-ended: keep saving, no finish line. */
  targetAmount: number;
  currentAmount: number;
  splitPercentage: number;
  icon: string;
  imageUrl: string;
  isLocked: boolean;
  /** Off means this goal sits out of every deposit split. Absent = on. */
  autoSplit: boolean;
  /** Epoch ms. Firestore has no implicit ordering, so we sort on this. */
  createdAt: number;
  /** Epoch ms once the goal is put away; absent or null while it is active. */
  archivedAt?: number | null;
}

import type { FeeKey, SecurityType, TradeFees } from './services/fees';

/**
 * `invest` is money leaving goals to buy shares; `divest` is a sale's proceeds
 * coming back into them. Neither is spending or saving — the report keeps them
 * on their own lines — and both belong to a trade, which is where they are edited.
 */
export type ActivityType = 'auto-save' | 'manual' | 'withdraw' | 'borrow' | 'invest' | 'divest';

export interface Activity {
  id: string;
  type: ActivityType;
  date: string;
  /** Always the positive magnitude of what the user entered. */
  amount: number;
  /** Signed per bank: money in is positive, money out is negative. */
  distributions: { bankId: string; amount: number; percentage: number }[];
  /** Portion of a deposit that cleared debt instead of feeding the split. */
  repaid?: number;
  /** Which debts this entry paid down, so deleting it can put them back. */
  repayments?: { loanId: string; amount: number }[];
  /** Set on a borrow entry, linking it to the debt it created. */
  loanId?: string;
  note?: string;
  /**
   * What a withdrawal was for — a key from services/categories.ts, never a
   * label. Only spending carries one; an entry without it reads as Other,
   * which is every entry made before categories existed.
   */
  category?: string;
  /** `invest` / `divest`: the trade this money moved for, and what it was. */
  tradeId?: string;
  counter?: string;
  units?: number;
}

/** Money taken out of the goals that future income is expected to put back. */
export interface Loan {
  id: string;
  /** What was originally borrowed. */
  amount: number;
  /** What is still owed; 0 once settled. */
  outstanding: number;
  note: string;
  /** Legacy: older borrows deducted from goals. New ones never do. */
  sources: { bankId: string; amount: number }[];
  createdAt: number;
  settledAt: string | null;
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Schedule {
  id: string;
  amount: number;
  frequency: Frequency;
  /** 0 = Sunday .. 6 = Saturday. Used by `weekly`. */
  weekday: number;
  /** 1..31, clamped to the month's length. Used by `monthly` and `yearly`. */
  dayOfMonth: number;
  /** 1..12. Used by `yearly`. */
  month: number;
  /** null spreads the amount across the strategy; otherwise one bank takes it all. */
  targetBankId: string | null;
  enabled: boolean;
  /** ISO date of the latest occurrence already posted. */
  lastRunAt: string;
  createdAt: number;
}

/**
 * One Bursa counter you hold. There is never more than one row per symbol:
 * buying more folds into the row that is already there, so the counter always
 * has a single cost basis and the dividend bookkeeping has one place to land.
 */
/**
 * A position as it stands today. Nothing stores this — it is replayed from
 * the trade log every time, which is what keeps the two from ever drifting
 * apart. See `buildHoldings` in services/holdings.ts.
 */
export interface Holding {
  /** The symbol itself: one position per counter, so it needs no other key. */
  id: string;
  /** Yahoo's symbol, uppercase with the exchange suffix: "1155.KL". Unique. */
  symbol: string;
  /** Short name as the search returned it, e.g. "MAYBANK". */
  name: string;
  units: number;
  /**
   * Everything paid for those units, in whole sen. The average is divided out
   * of this when it is shown — storing the average instead would shed a sen on
   * every top-up.
   */
  costCents: number;
  /** The first trade's date, which is how long this has been held. */
  createdAt: number;
}

/**
 * One line in the trade log, and the only thing about a position that is
 * actually stored. Units and cost are replayed out of these rather than kept
 * as a running total, so correcting a number you typed wrong in March fixes
 * that trade alone and leaves every trade after it standing.
 *
 * The dates are the point. A dividend belongs to whoever held the shares on
 * the ex-date, not to whoever holds them on the day it pays, so the app has to
 * be able to answer "how many units did I hold that day" months later. Without
 * a date on each trade that answer is gone for good.
 */
export interface Trade {
  id: string;
  /** Yahoo's symbol, uppercase with the exchange suffix: "1155.KL". */
  symbol: string;
  /** Short name as the search returned it, kept so the log reads without a lookup. */
  name: string;
  /**
   * A dividend neither adds units nor changes what was paid for them — it is
   * cash out, recorded here so the log is the whole story of a counter.
   */
  kind: 'buy' | 'sell' | 'dividend';
  /** Units traded; for a dividend, the units it was paid on. */
  units: number;
  /** Buy and sell: the traded price per unit, in whole sen. */
  priceCents: number;
  /**
   * Dividends only, and the reason they cannot reuse `priceCents`: Bursa pays
   * amounts like RM0.0125, which is not a whole number of sen. This is per
   * unit in ten-thousandths of a ringgit, so RM0.3300 is 3300.
   */
  perUnitPoints?: number;
  /**
   * Dividends only: the ex-date this was owed on. It is what makes crediting
   * idempotent — one dividend per counter per ex-date, however many times the
   * app checks.
   */
  exDate?: number;
  /** Local midnight of the day it happened. Exchanges settle by day. */
  tradedAt: number;
  /** Epoch ms it was entered, which orders two trades made the same day. */
  createdAt: number;
  /**
   * Buy and sell: the price in ten-thousandths of a ringgit, because penny
   * stocks trade in half-sen (RM0.345 is 3450) and `priceCents` cannot hold
   * that. Absent on trades made before it existed, whose `priceCents` is exact.
   */
  pricePoints?: number;
  /** What the broker, the exchange and the tax took. Absent on older trades: none recorded. */
  fees?: TradeFees;
  /** Snapshot at the time: a REIT's fees and tax treatment differ from a share's. */
  securityType?: SecurityType;
  /** Where the money for a buy came from, or where a sale's went. Absent: nothing moved. */
  money?: TradeMoney;
  /** Fees typed over what the broker's rates gave, and in which direction. */
  feeEdits?: Partial<Record<FeeKey, 1 | -1>>;
}

export type TradeMoney =
  /** Buy: paid from one goal. Sell: deposited into one goal. */
  | { mode: 'goal'; goalId: string; activityId: string }
  /** Sell only: split like any deposit, spent ahead covered first. */
  | { mode: 'split'; activityId: string }
  /** Only the trade is recorded; no goal's money moved. */
  | { mode: 'none' };

export type AlertKind = 'receipt' | 'milestone' | 'reached' | 'streak' | 'dividend' | 'housekeeping';

/**
 * Something the app noticed and wants to tell the user about. Alerts are
 * derived from money movements at the moment they happen and stored as their
 * own documents, so they survive the ledger being pruned — but they are
 * disposable: nothing is ever computed from them.
 */
export interface Alert {
  id: string;
  kind: AlertKind;
  /** ISO. */
  date: string;
  read: boolean;
  /** `milestone` / `reached`: which goal, and where it stands. */
  bankId?: string;
  bankName?: string;
  /**
   * `reached`: the share the full goal still takes of every deposit.
   * `milestone`: how far along it is — absent for a goal with no target,
   * which has no percentage to be a percentage of.
   */
  percent?: number;
  /** `milestone`: the round amount the balance passed. */
  reachedAmount?: number;
  /** `milestone`: what is still to go. `receipt`: the deposit's total. */
  amount?: number;
  /** `receipt`: what each goal received. */
  lines?: { bankId: string; name: string; amount: number }[];
  /** `streak`: consecutive days of saving. */
  days?: number;
  /** `reached`: the goal's share was handed on automatically. */
  overflow?: boolean;
  /** `dividend`: which counter paid, and on how many units. */
  counter?: string;
  units?: number;
  /** `housekeeping`: how many months of ledger are being kept. */
  months?: number;
}

/**
 * A dividend a company has declared, as the exchange's announcement states it.
 * Nothing here is about one person's holding — how much it comes to depends on
 * the units held on the ex-date, which only the trade log knows.
 */
export interface Dividend {
  symbol: string;
  /** The company's own wording, e.g. "Second Interim Dividend". */
  subject: string;
  /** Local midnight, epoch ms. Own the shares before this day to be paid. */
  exDate: number;
  /** Local midnight, epoch ms. The day the money actually arrives. */
  payDate: number;
  /** Per unit in ten-thousandths of a ringgit: RM0.3300 is 3300. */
  perUnitPoints: number;
  announcedAt: number;
}

/**
 * What the portfolio was worth at the end of one month.
 *
 * Written once a month and never back-dated, because there is no way to know
 * honestly what a share was worth on a day the app was not there to look. The
 * cost side can be replayed from the trade log at any time; this is the other
 * half, and it only exists from the month the app started recording it.
 */
export interface Snapshot {
  /** "2026-09", and the document id. */
  id: string;
  /** Epoch ms of the month end this describes. */
  at: number;
  valueCents: number;
  costCents: number;
}

export interface SavingsSettings {
  /**
   * When a goal reaches its target, hand its share of every deposit to the
   * goals still short of theirs instead of feeding a finished goal.
   */
  overflow: boolean;
  /**
   * Whole months of ledger kept before old entries are cleared automatically.
   * `null` keeps everything.
   *
   * This is about how much the app has to read, not how much it can store: a
   * free Firestore project holds hundreds of thousands of entries, but it is
   * read in full every time the app opens, and the daily read allowance runs
   * out long before the space does.
   *
   * Only the activity log is ever cleared. Goal balances, debts and the trade
   * log are untouched — the balances are held on the goals themselves, and the
   * trades are what positions are worked out from, so neither can be lost by
   * clearing history.
   */
  retentionMonths: number | null;
  /** True once the automatic clearing has been shown and accepted. */
  retentionAcknowledged: boolean;
}

export interface NotificationPrefs {
  /** In-app receipt for every auto deposit the app posts. */
  receipts: boolean;
  /** In-app card at 25 / 50 / 75 / 100 % of a goal's target. */
  milestones: boolean;
  /** System notification every evening. */
  reminder: boolean;
  /** "HH:MM", 24-hour. */
  reminderTime: string;
  /** System notification on the 1st of each month pointing at the Report. */
  digest: boolean;
  /**
   * A nudge two days before a counter goes ex-dividend. That day decides
   * who the payment belongs to, so it is the one worth interrupting for.
   */
  exDates: boolean;
}

export enum Tab {
  HOME = 'home',
  STATS = 'stats',
  BANKS = 'banks',
  SETTINGS = 'settings',
  LOG = 'log',
  /* The investing half of the bar. Home is shared: the card you swipe to
     there is what decides which set of destinations the bar offers. */
  TRADES = 'trades',
  DIVIDENDS = 'dividends',
  GROWTH = 'growth'
}
