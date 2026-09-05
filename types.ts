
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

export type ActivityType = 'auto-save' | 'manual' | 'withdraw' | 'borrow';

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

export type AlertKind = 'receipt' | 'milestone' | 'reached' | 'streak';

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
  percent?: number;
  /** `milestone`: what is still to go. `receipt`: the deposit's total. */
  amount?: number;
  /** `receipt`: what each goal received. */
  lines?: { bankId: string; name: string; amount: number }[];
  /** `streak`: consecutive days of saving. */
  days?: number;
  /** `reached`: the goal's share was handed on automatically. */
  overflow?: boolean;
}

export interface SavingsSettings {
  /**
   * When a goal reaches its target, hand its share of every deposit to the
   * goals still short of theirs instead of feeding a finished goal.
   */
  overflow: boolean;
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
}

export enum Tab {
  HOME = 'home',
  STATS = 'stats',
  BANKS = 'banks',
  SETTINGS = 'settings',
  LOG = 'log'
}
