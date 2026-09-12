import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  writeBatch,
  runTransaction,
  increment,
  type Unsubscribe,
  type FirestoreError,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import type { Activity, ActivityType, Alert, Holding, Loan, NotificationPrefs, PiggyBank, SavingsSettings, Schedule, Snapshot, Trade, AlertKind } from '../types';
import { allowedRetention, retentionCutoff } from './analytics';
import { UNCATEGORISED } from './categories';
import { dayStart } from './holdings';
import { dividendTradeId, type DueDividend } from './dividends';
import { dueOccurrences } from './schedules';
import { fromCents, splitByPercentage, toCents } from './money';
import { archiveStrategy, isInSplit, outstandingCents, planDeposit, planWithdrawal, type Movement } from './ledger';
import { DEFAULT_PREFS, DEFAULT_SAVINGS, milestoneAlerts, receiptAlert, type AlertDraft } from './alerts';

export { isInSplit, isArchived, isFull } from './ledger';

const banksCol = (uid: string) => collection(db, 'users', uid, 'banks');
const activitiesCol = (uid: string) => collection(db, 'users', uid, 'activities');
const schedulesCol = (uid: string) => collection(db, 'users', uid, 'schedules');
const loansCol = (uid: string) => collection(db, 'users', uid, 'loans');
const alertsCol = (uid: string) => collection(db, 'users', uid, 'alerts');
const bankRef = (uid: string, id: string) => doc(db, 'users', uid, 'banks', id);
const activityRef = (uid: string, id: string) => doc(db, 'users', uid, 'activities', id);
const scheduleRef = (uid: string, id: string) => doc(db, 'users', uid, 'schedules', id);
const loanRef = (uid: string, id: string) => doc(db, 'users', uid, 'loans', id);
const alertRef = (uid: string, id: string) => doc(db, 'users', uid, 'alerts', id);
const tradesCol = (uid: string) => collection(db, 'users', uid, 'trades');
const tradeRef = (uid: string, id: string) => doc(db, 'users', uid, 'trades', id);
/**
 * Proof that a dividend has already been paid in. It is deliberately not
 * the trade row: that row is a record the user can tidy away, and keying
 * the check on it meant deleting it made the dividend due all over again
 * while the money stayed in the goals.
 */
const snapshotsCol = (uid: string) => collection(db, 'users', uid, 'snapshots');
const snapshotRef = (uid: string, id: string) => doc(db, 'users', uid, 'snapshots', id);
const creditedCol = (uid: string) => collection(db, 'users', uid, 'dividendsPaid');
const creditedRef = (uid: string, id: string) => doc(db, 'users', uid, 'dividendsPaid', id);
/** Only still read, to move anyone who has one onto the trade log. */
const legacyHoldingsCol = (uid: string) => collection(db, 'users', uid, 'holdings');
const prefsRef = (uid: string) => doc(db, 'users', uid, 'settings', 'notifications');
const savingsRef = (uid: string) => doc(db, 'users', uid, 'settings', 'savings');

/** Which alerts a deposit is allowed to raise. */
export type AlertOptions = Pick<NotificationPrefs, 'receipts' | 'milestones'>;

/** Everything a deposit needs to know beyond the money itself. */
export interface DepositOptions {
  alerts?: AlertOptions;
  savings?: SavingsSettings;
}

/** Alerts ride in the same batch as the money they describe. */
const queueAlerts = (batch: ReturnType<typeof writeBatch>, uid: string, drafts: AlertDraft[]) =>
  drafts.forEach(({ id, ...rest }) => batch.set(alertRef(uid, id), { ...rest, read: false }));

/** Movements are planned in cents; documents store ordinary amounts. */
const toDistributions = (movements: Movement[]) =>
  movements.map((m) => ({
    bankId: m.bankId,
    amount: fromCents(m.cents),
    percentage: m.percentage,
  }));

/* ---------------------------------------------------------------- profile */

/** Creates users/{uid} on first sign-in; refreshes profile fields after that. */
export const ensureUserProfile = async (user: User) => {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  await setDoc(
    ref,
    {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      updatedAt: Date.now(),
      ...(snap.exists() ? {} : { createdAt: Date.now() }),
    },
    { merge: true }
  );
};

/* ------------------------------------------------------------ subscriptions */

export const subscribeToBanks = (
  uid: string,
  onChange: (banks: PiggyBank[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(banksCol(uid), orderBy('createdAt', 'asc')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PiggyBank)),
    onError
  );

/**
 * The ledger, back as far as it is kept.
 *
 * Every open re-reads all of these, and a free project allows fifty thousand
 * document reads a day — which a few thousand entries turns into a handful of
 * app opens. Reading only what is kept is what stops that arriving. When
 * nothing is being cleared the window is open and everything is read, which is
 * the honest consequence of choosing to keep it all.
 */
export const subscribeToActivities = (
  uid: string,
  retentionMonths: number | null,
  onChange: (activities: Activity[], fromCache: boolean) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe => {
  const from = retentionCutoff(new Date(), retentionMonths).toISOString();
  return onSnapshot(
    retentionMonths === null
      ? query(activitiesCol(uid), orderBy('date', 'desc'))
      : query(activitiesCol(uid), where('date', '>=', from), orderBy('date', 'desc')),
    { includeMetadataChanges: true },
    // Whether this came from the phone or the server is part of the answer:
    // an empty cache and an empty account look the same without it.
    (snap) =>
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity),
        snap.metadata.fromCache
      ),
    onError
  );
};

export const subscribeToSchedules = (
  uid: string,
  onChange: (schedules: Schedule[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(schedulesCol(uid), orderBy('createdAt', 'asc')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Schedule)),
    onError
  );

export const subscribeToLoans = (
  uid: string,
  onChange: (loans: Loan[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(loansCol(uid), orderBy('createdAt', 'asc')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Loan)),
    onError
  );

export const subscribeToAlerts = (
  uid: string,
  onChange: (alerts: Alert[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(alertsCol(uid), orderBy('date', 'desc')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Alert)),
    onError
  );

/** The ids of every dividend already paid in — one small read per open. */
export const subscribeToCreditedDividends = (
  uid: string,
  onChange: (ids: string[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(creditedCol(uid), (snap) => onChange(snap.docs.map((d) => d.id)), onError);

export const subscribeToSnapshots = (
  uid: string,
  onChange: (snapshots: Snapshot[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(snapshotsCol(uid), orderBy('at', 'asc')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Snapshot)),
    onError
  );

/**
 * Records what the portfolio was worth at the end of a month, once.
 *
 * `setDoc` on a month-keyed id rather than a new document each time: running
 * twice writes the same row, and a month already recorded is never rewritten
 * with today's prices, which would quietly turn history into a guess.
 */
export const writeSnapshot = async (uid: string, snapshot: Omit<Snapshot, 'id'> & { id: string }) => {
  const { id, ...rest } = snapshot;
  const ref = snapshotRef(uid, id);
  if ((await getDoc(ref)).exists()) return false;
  await setDoc(ref, rest);
  return true;
};

export const subscribeToTrades = (
  uid: string,
  onChange: (trades: Trade[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    // Newest first, which is the order the trade log reads in. Positions are
    // replayed from the whole set, so the order here is only for the screen.
    query(tradesCol(uid), orderBy('tradedAt', 'desc')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trade)),
    onError
  );

/** Missing document means the defaults; a partial one is filled in. */
export const subscribeToPrefs = (
  uid: string,
  onChange: (prefs: NotificationPrefs) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(prefsRef(uid), (snap) => onChange({ ...DEFAULT_PREFS, ...(snap.data() ?? {}) }), onError);

export const savePrefs = (uid: string, patch: Partial<NotificationPrefs>) =>
  setDoc(prefsRef(uid), patch, { merge: true });

export const subscribeToSavings = (
  uid: string,
  onChange: (savings: SavingsSettings) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    savingsRef(uid),
    (snap) => {
      const saved = { ...DEFAULT_SAVINGS, ...(snap.data() ?? {}) } as SavingsSettings;
      // A window the app no longer offers is brought back into range here,
      // so nothing downstream ever has to cope with "keep everything".
      onChange({ ...saved, retentionMonths: allowedRetention(saved.retentionMonths) });
    },
    onError
  );

export const saveSavings = (uid: string, patch: Partial<SavingsSettings>) =>
  setDoc(savingsRef(uid), patch, { merge: true });

/* ------------------------------------------------------------------- banks */

export const createBank = async (uid: string, goal: Partial<PiggyBank>) => {
  const name = goal.name || 'New Goal';
  const bank: Omit<PiggyBank, 'id'> = {
    name,
    targetAmount: Math.max(0, goal.targetAmount ?? 1000),
    currentAmount: 0,
    splitPercentage: 0,
    icon: goal.icon || 'savings',
    // Empty means "no upload"; the card draws its own artwork instead of
    // depending on an image host that may not be reachable.
    imageUrl: goal.imageUrl || '',
    isLocked: false,
    autoSplit: goal.autoSplit ?? true,
    createdAt: Date.now(),
  };
  const ref = await addDoc(banksCol(uid), bank);
  return ref.id;
};

/** Persists the whole allocation strategy in one atomic write. */
export const saveStrategy = async (uid: string, banks: PiggyBank[]) => {
  const batch = writeBatch(db);
  banks.forEach((b) =>
    batch.update(bankRef(uid, b.id), {
      splitPercentage: b.splitPercentage,
      isLocked: b.isLocked,
      autoSplit: b.autoSplit,
    })
  );
  await batch.commit();
};

export const updateBank = (uid: string, id: string, patch: Partial<PiggyBank>) =>
  updateDoc(bankRef(uid, id), patch);

export const deleteBank = (uid: string, id: string) => deleteDoc(bankRef(uid, id));

/**
 * Puts a finished goal away. Its money and its history stay exactly where they
 * are — only the strategy changes, because the share it was taking is passed
 * to the goals still saving rather than quietly going nowhere.
 */
export const archiveBank = async (uid: string, banks: PiggyBank[], id: string) => {
  const next = archiveStrategy(banks, id);
  const batch = writeBatch(db);

  next.forEach((bank) => {
    const before = banks.find((b) => b.id === bank.id)!;
    if (bank.id === id) {
      batch.update(bankRef(uid, id), {
        archivedAt: Date.now(),
        splitPercentage: 0,
        autoSplit: false,
      });
    } else if (bank.splitPercentage !== before.splitPercentage) {
      batch.update(bankRef(uid, bank.id), { splitPercentage: bank.splitPercentage });
    }
  });

  await batch.commit();
};

/** Back on the shelf, but out of the split until the user gives it a share. */
export const unarchiveBank = (uid: string, id: string) =>
  updateDoc(bankRef(uid, id), { archivedAt: null });

/* -------------------------------------------------------------- activities */

/**
 * Records income. Borrowed money is paid back first — oldest debt first — and
 * that repayment leaves the app rather than landing in a goal, because it never
 * came out of one. Only what survives is fed through the strategy split.
 */
export const deposit = async (
  uid: string,
  amount: number,
  banks: PiggyBank[],
  loans: Loan[],
  targetBankId: string | null = null,
  { alerts = DEFAULT_PREFS, savings = DEFAULT_SAVINGS }: DepositOptions = {}
) => {
  const plan = planDeposit(toCents(amount), banks, loans, targetBankId, savings.overflow);
  if (plan.movements.length === 0 && plan.repayments.length === 0) {
    throw new Error('Nothing to deposit into.');
  }

  const now = new Date();
  const batch = writeBatch(db);

  batch.set(doc(activitiesCol(uid)), {
    type: 'manual' satisfies ActivityType,
    date: now.toISOString(),
    amount: fromCents(toCents(amount)),
    distributions: toDistributions(plan.movements),
    repaid: fromCents(plan.repaidCents),
    repayments: plan.repayments.map((r) => ({ loanId: r.loan.id, amount: fromCents(r.cents) })),
  });

  plan.movements.forEach((m) =>
    batch.update(bankRef(uid, m.bankId), { currentAmount: increment(fromCents(m.cents)) })
  );

  plan.repayments.forEach((r) => {
    const left = outstandingCents(r.loan) - r.cents;
    batch.update(loanRef(uid, r.loan.id), {
      outstanding: fromCents(left),
      settledAt: left === 0 ? now.toISOString() : null,
    });
  });

  // The user typed this one in themselves, so there is no receipt to send.
  if (alerts.milestones) queueAlerts(batch, uid, milestoneAlerts(banks, plan.movements, now, savings.overflow));

  await batch.commit();
  return plan;
};

/**
 * Spending from one goal. Going past the balance is allowed on purpose: the
 * goal runs negative and simply climbs back as future splits feed it.
 */
export const withdraw = async (
  uid: string,
  amount: number,
  sourceBankId: string,
  note = '',
  category: string = UNCATEGORISED
) => {
  const movements = planWithdrawal(toCents(amount), sourceBankId);
  if (movements.length === 0) throw new Error('Enter an amount to withdraw.');

  const batch = writeBatch(db);
  batch.set(doc(activitiesCol(uid)), {
    type: 'withdraw' satisfies ActivityType,
    date: new Date().toISOString(),
    amount: fromCents(toCents(amount)),
    distributions: toDistributions(movements),
    note,
    category,
  });
  movements.forEach((m) =>
    batch.update(bankRef(uid, m.bankId), { currentAmount: increment(fromCents(m.cents)) })
  );
  await batch.commit();
};

/**
 * Borrowing is money from outside, so no goal is touched — it only records what
 * is owed, which the next untargeted deposits clear before anything is split.
 */
export const borrow = async (uid: string, amount: number, note = '') => {
  const cents = toCents(amount);
  if (cents <= 0) throw new Error('Enter an amount to spend.');

  const loan = await addDoc(loansCol(uid), {
    amount: fromCents(cents),
    outstanding: fromCents(cents),
    note,
    sources: [],
    createdAt: Date.now(),
    settledAt: null,
  });

  await addDoc(activitiesCol(uid), {
    type: 'borrow' satisfies ActivityType,
    date: new Date().toISOString(),
    amount: fromCents(cents),
    distributions: [],
    loanId: loan.id,
    note,
  });
};

export const deleteLoan = (uid: string, id: string) => deleteDoc(loanRef(uid, id));

/** Re-labelling a past entry. Touches no balance, so it needs no transaction. */
export const setActivityCategory = (uid: string, id: string, category: string) =>
  updateDoc(activityRef(uid, id), { category });

/** Removes an activity and reverses its movements, never below zero. */
export const deleteActivity = (uid: string, activity: Activity) =>
  runTransaction(db, async (tx) => {
    const refs = activity.distributions.map((d) => bankRef(uid, d.bankId));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));

    snaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      // Distributions are signed, so subtracting undoes deposits and
      // withdrawals alike.
      const next = toCents(snap.data().currentAmount ?? 0) - toCents(activity.distributions[i].amount);
      tx.update(refs[i], { currentAmount: fromCents(next) });
    });

    // Undoing a repayment puts the debt back; undoing a borrow drops it.
    activity.repayments?.forEach((r) =>
      tx.update(loanRef(uid, r.loanId), { outstanding: increment(r.amount), settledAt: null })
    );
    if (activity.loanId) tx.delete(loanRef(uid, activity.loanId));

    tx.delete(activityRef(uid, activity.id));
  });

/** Rewrites a plain deposit's amount and applies the delta to each goal. */
/**
 * Correcting the amount of a past deposit.
 *
 * The shares are re-split with the same rule the original deposit used, so
 * the parts still add up to the whole: splitting each one on its own and
 * flooring shed the odd cent, leaving the entry's total larger than the sum
 * of what it says reached the goals.
 *
 * Anything this cannot honestly rewrite is refused rather than half-applied.
 * A missing goal used to be skipped silently while the total was rewritten
 * anyway, which left the ledger and the balances disagreeing with no trace.
 */
export const editActivity = (uid: string, activity: Activity, newAmount: number) =>
  runTransaction(db, async (tx) => {
    if (activity.repaid || (activity.repayments?.length ?? 0) > 0) {
      throw new Error('This one repaid a debt. Delete it and record it again instead.');
    }

    const shares = splitByPercentage(
      toCents(newAmount),
      activity.distributions.map((d) => ({ item: d, percentage: d.percentage }))
    );
    const distributions = activity.distributions.map((d) => ({
      ...d,
      amount: fromCents(shares.find((s) => s.item === d)?.cents ?? 0),
    }));

    const refs = distributions.map((d) => bankRef(uid, d.bankId));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));

    const missing = snaps.findIndex((snap) => !snap.exists());
    if (missing >= 0) {
      throw new Error('One of the goals this went into has been deleted, so it cannot be corrected.');
    }

    snaps.forEach((snap, i) => {
      const delta = toCents(distributions[i].amount) - toCents(activity.distributions[i].amount);
      const next = toCents(snap.data().currentAmount ?? 0) + delta;
      tx.update(refs[i], { currentAmount: fromCents(next) });
    });
    tx.update(activityRef(uid, activity.id), { amount: fromCents(toCents(newAmount)), distributions });
  });

/**
 * Housekeeping, not an undo: clears old ledger entries so the app stays light
 * to load. Only the activity documents go — goal balances and debts are left
 * exactly as they are, which is why this never goes through deleteActivity.
 */
export const pruneActivities = async (uid: string, ids: string[]) => {
  // A batch holds at most 500 writes.
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(activityRef(uid, id)));
    await batch.commit();
  }
  return ids.length;
};

/**
 * Clears ledger entries older than the kept window, a few hundred at a time.
 *
 * This deliberately queries rather than working from what the app has in
 * memory: the subscription only carries what is kept, so the entries due to go
 * are exactly the ones it cannot see.
 *
 * As with pruneActivities, only activity documents are removed. Goal balances,
 * debts and the trade log stay exactly as they are — clearing history can
 * never move money.
 */
/** Whether anything at all sits before the cutoff — one document read. */
export const hasOlderThan = async (uid: string, cutoff: Date) => {
  const snap = await getDocs(
    query(activitiesCol(uid), where('date', '<', cutoff.toISOString()), orderBy('date', 'asc'), limit(1))
  );
  return !snap.empty;
};

export const pruneOlderThan = async (uid: string, cutoff: Date, max = 800) => {
  const before = cutoff.toISOString();
  let removed = 0;

  while (removed < max) {
    const snap = await getDocs(
      query(activitiesCol(uid), where('date', '<', before), orderBy('date', 'asc'), limit(400))
    );
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    // A short page means there was nothing else waiting.
    if (snap.size < 400) break;
  }
  return removed;
};

/* ------------------------------------------------------------------ alerts */

export const addAlert = (uid: string, { id, ...rest }: AlertDraft) =>
  setDoc(alertRef(uid, id), { ...rest, read: false });

export const markAlertsRead = async (uid: string, ids: string[]) => {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(alertRef(uid, id), { read: true }));
  await batch.commit();
};

export const pruneAlerts = async (uid: string, ids: string[]) => {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.slice(0, 400).forEach((id) => batch.delete(alertRef(uid, id)));
  await batch.commit();
};

/* ------------------------------------------------------------------ trades */

/**
 * Positions are not stored. This log is, and the position is replayed from it,
 * so a trade entered wrong is fixed by fixing that one trade rather than by
 * overwriting a total and losing the history a dividend depends on.
 */
export const createTrade = (uid: string, trade: Omit<Trade, 'id' | 'createdAt'>) =>
  addDoc(tradesCol(uid), { ...trade, tradedAt: dayStart(trade.tradedAt), createdAt: Date.now() });

export const updateTrade = (uid: string, id: string, patch: Partial<Omit<Trade, 'id'>>) =>
  updateDoc(tradeRef(uid, id), patch.tradedAt ? { ...patch, tradedAt: dayStart(patch.tradedAt) } : patch);

export const deleteTrade = (uid: string, id: string) => deleteDoc(tradeRef(uid, id));

/**
 * Positions recorded before the log existed carried a total and no history.
 * Each becomes a single opening buy on the day it was first entered, which is
 * the most that can honestly be said about when those units were acquired —
 * the real dates were never asked for. Runs once: the old row is removed in
 * the same batch, so a second run finds nothing to do.
 */
export const migrateHoldingsToTrades = async (uid: string) => {
  const snap = await getDocs(legacyHoldingsCol(uid));
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  for (const legacy of snap.docs) {
    const holding = legacy.data() as Omit<Holding, 'id'>;
    if (holding.units > 0) {
      batch.set(doc(tradesCol(uid)), {
        symbol: holding.symbol,
        name: holding.name,
        kind: 'buy',
        units: holding.units,
        // The average is all that survived, so it stands in for the price.
        priceCents: Math.round(holding.costCents / holding.units),
        tradedAt: dayStart(holding.createdAt ?? Date.now()),
        createdAt: Date.now(),
      });
    }
    batch.delete(legacy.ref);
  }
  await batch.commit();
  return snap.size;
};

/**
 * Paying a dividend into the savings, on the day it lands.
 *
 * It goes in as an ordinary deposit — the same split across the same goals,
 * clearing any borrowing first — because it is ordinary money. What is not
 * ordinary is that the app decides to record it rather than the user, so two
 * things are true of this function:
 *
 * It runs inside a transaction keyed on the dividend's own id, so opening the
 * app on two phones, or twice in a minute, credits it once. The id is the
 * counter and the ex-date, which is what identifies a payment.
 *
 * And it writes the trade with the units it was worked out on, so the log
 * shows how the figure was reached. Companies deduct tax and fees, so the
 * amount that lands is often not the amount announced — the trade is editable
 * like any other, and the alert says to check it.
 */
export const creditDividend = async (
  uid: string,
  due: DueDividend,
  name: string,
  banks: PiggyBank[],
  loans: Loan[],
  { alerts = DEFAULT_PREFS, savings = DEFAULT_SAVINGS }: DepositOptions = {}
) => {
  const { dividend, units, amountCents } = due;
  const id = dividendTradeId(dividend.symbol, dividend.exDate);
  const plan = planDeposit(amountCents, banks, loans, null, savings.overflow);
  // Nowhere for it to go means nothing is recorded, and it stays due: better
  // to credit it late, once there is a goal, than to lose it quietly.
  if (plan.movements.length === 0 && plan.repayments.length === 0) return null;

  const now = new Date();

  return runTransaction(db, async (tx) => {
    // The read is what makes this safe to run from anywhere, at any time.
    if ((await tx.get(creditedRef(uid, id))).exists()) return null;

    tx.set(tradeRef(uid, id), {
      symbol: dividend.symbol,
      name,
      kind: 'dividend' satisfies Trade['kind'],
      units,
      priceCents: 0,
      perUnitPoints: dividend.perUnitPoints,
      exDate: dividend.exDate,
      tradedAt: dayStart(dividend.payDate),
      createdAt: Date.now(),
    });

    tx.set(doc(activitiesCol(uid)), {
      type: 'manual' satisfies ActivityType,
      date: now.toISOString(),
      amount: fromCents(amountCents),
      distributions: toDistributions(plan.movements),
      repaid: fromCents(plan.repaidCents),
      repayments: plan.repayments.map((r) => ({ loanId: r.loan.id, amount: fromCents(r.cents) })),
      note: `${name} dividend`,
    });

    plan.movements.forEach((m) =>
      tx.update(bankRef(uid, m.bankId), { currentAmount: increment(fromCents(m.cents)) })
    );

    plan.repayments.forEach((r) => {
      const left = outstandingCents(r.loan) - r.cents;
      tx.update(loanRef(uid, r.loan.id), {
        outstanding: fromCents(left),
        settledAt: left === 0 ? now.toISOString() : null,
      });
    });

    /*
      The marker the guard above reads, written in the same transaction as the
      money it describes.

      It was missing. The guard read a document nothing ever wrote, so the set
      of credited dividends stayed empty forever: `dueDividends` kept reporting
      this one as unpaid and the guard never short-circuited. The trade row
      survived that, because its id is derived from the counter and ex-date and
      a repeat just overwrote it — but the money did not. Every app open added
      another activity, incremented the goals again, and re-applied the loan
      repayments. A dividend was being paid in over and over.

      Same transaction is the whole point: either the money moved and this says
      so, or neither happened.
    */
    tx.set(creditedRef(uid, id), {
      creditedAt: now.toISOString(),
      symbol: dividend.symbol,
      exDate: dividend.exDate,
      units,
      amountCents,
    });

    // This one the user did not type in, so it is worth telling them about
    // whatever their milestone setting says.
    tx.set(alertRef(uid, `dividend_${id}`), {
      kind: 'dividend' satisfies AlertKind,
      date: now.toISOString(),
      read: false,
      counter: name,
      units,
      amount: fromCents(amountCents),
    });

    if (alerts.milestones) {
      for (const draft of milestoneAlerts(banks, plan.movements, now, savings.overflow)) {
        const { id: alertId, ...rest } = draft;
        tx.set(alertRef(uid, alertId), { ...rest, read: false });
      }
    }

    return { amountCents, units };
  });
};

/* --------------------------------------------------------------- schedules */

export const createSchedule = (
  uid: string,
  schedule: Omit<Schedule, 'id' | 'createdAt' | 'lastRunAt'>
) =>
  addDoc(schedulesCol(uid), {
    ...schedule,
    // Starts counting from now, so creating a rule never backfills history.
    lastRunAt: new Date().toISOString(),
    createdAt: Date.now(),
  });

export const updateSchedule = (uid: string, id: string, patch: Partial<Schedule>) =>
  updateDoc(scheduleRef(uid, id), patch);

export const deleteSchedule = (uid: string, id: string) => deleteDoc(scheduleRef(uid, id));

/**
 * Posts every occurrence a schedule missed while the app was closed. There is
 * no server on the free plan to fire these on time, so they are reconciled on
 * open. Each occurrence writes its deposit and advances lastRunAt in the same
 * batch, so an interrupted run can never post the same day twice.
 */
export const runDueSchedules = async (
  uid: string,
  schedules: Schedule[],
  banks: PiggyBank[],
  loans: Loan[],
  { alerts = DEFAULT_PREFS, savings = DEFAULT_SAVINGS }: DepositOptions = {}
) => {
  // Scheduled income clears debt too, so the balance is tracked across the run.
  let openLoans = loans.map((l) => ({ ...l }));
  // Likewise goal balances, so milestones are judged against the running total.
  let liveBanks = banks.map((b) => ({ ...b }));
  let posted = 0;

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;

    for (const when of dueOccurrences(schedule)) {
      const plan = planDeposit(toCents(schedule.amount), liveBanks, openLoans, schedule.targetBankId, savings.overflow);
      // Nothing allocated and no debt to clear: wait for a strategy instead.
      if (plan.movements.length === 0 && plan.repayments.length === 0) break;

      const batch = writeBatch(db);
      const entry = doc(activitiesCol(uid));
      batch.set(entry, {
        type: 'auto-save' satisfies ActivityType,
        date: when.toISOString(),
        amount: fromCents(toCents(schedule.amount)),
        distributions: toDistributions(plan.movements),
        repaid: fromCents(plan.repaidCents),
        repayments: plan.repayments.map((r) => ({ loanId: r.loan.id, amount: fromCents(r.cents) })),
      });
      plan.movements.forEach((m) =>
        batch.update(bankRef(uid, m.bankId), { currentAmount: increment(fromCents(m.cents)) })
      );
      plan.repayments.forEach((r) => {
        const left = outstandingCents(r.loan) - r.cents;
        batch.update(loanRef(uid, r.loan.id), {
          outstanding: fromCents(left),
          settledAt: left === 0 ? when.toISOString() : null,
        });
      });
      batch.update(scheduleRef(uid, schedule.id), { lastRunAt: when.toISOString() });

      const drafts: AlertDraft[] = [];
      if (alerts.receipts) drafts.push(receiptAlert(entry.id, toCents(schedule.amount), liveBanks, plan.movements, when));
      if (alerts.milestones) drafts.push(...milestoneAlerts(liveBanks, plan.movements, when, savings.overflow));
      queueAlerts(batch, uid, drafts);

      await batch.commit();
      posted += 1;

      openLoans = openLoans.map((loan) => {
        const repayment = plan.repayments.find((r) => r.loan.id === loan.id);
        return repayment
          ? { ...loan, outstanding: fromCents(outstandingCents(loan) - repayment.cents) }
          : loan;
      });
      liveBanks = liveBanks.map((bank) => {
        const m = plan.movements.find((x) => x.bankId === bank.id);
        return m ? { ...bank, currentAmount: fromCents(toCents(bank.currentAmount) + m.cents) } : bank;
      });
    }
  }
  return posted;
};

/* ------------------------------------------------------------ sample data */

const SAMPLE_BANKS = [
  { name: 'Vacation', targetAmount: 5000, splitPercentage: 30, icon: 'beach_access' },
  { name: 'Emergency Fund', targetAmount: 10000, splitPercentage: 50, icon: 'shield_with_heart' },
  { name: 'New Tech', targetAmount: 2000, splitPercentage: 20, icon: 'devices' },
];

/** Three empty starter goals adding up to 100%, for trying the app out. */
export const seedSampleBanks = async (uid: string) => {
  const batch = writeBatch(db);
  SAMPLE_BANKS.forEach((b, i) =>
    batch.set(doc(banksCol(uid)), {
      ...b,
      currentAmount: 0,
      imageUrl: '',
      isLocked: false,
      autoSplit: true,
      createdAt: Date.now() + i,
    })
  );
  await batch.commit();
};
