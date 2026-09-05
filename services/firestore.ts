import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  runTransaction,
  increment,
  type Unsubscribe,
  type FirestoreError,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import type { Activity, ActivityType, Alert, Loan, NotificationPrefs, PiggyBank, SavingsSettings, Schedule } from '../types';
import { dueOccurrences } from './schedules';
import { fromCents, toCents } from './money';
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

export const subscribeToActivities = (
  uid: string,
  onChange: (activities: Activity[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(activitiesCol(uid), orderBy('date', 'desc')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity)),
    onError
  );

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
  onSnapshot(savingsRef(uid), (snap) => onChange({ ...DEFAULT_SAVINGS, ...(snap.data() ?? {}) }), onError);

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
export const withdraw = async (uid: string, amount: number, sourceBankId: string, note = '') => {
  const movements = planWithdrawal(toCents(amount), sourceBankId);
  if (movements.length === 0) throw new Error('Enter an amount to withdraw.');

  const batch = writeBatch(db);
  batch.set(doc(activitiesCol(uid)), {
    type: 'withdraw' satisfies ActivityType,
    date: new Date().toISOString(),
    amount: fromCents(toCents(amount)),
    distributions: toDistributions(movements),
    note,
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
  if (cents <= 0) throw new Error('Enter an amount to borrow.');

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
export const editActivity = (uid: string, activity: Activity, newAmount: number) =>
  runTransaction(db, async (tx) => {
    const distributions = activity.distributions.map((d) => ({
      ...d,
      amount: fromCents(Math.floor((toCents(newAmount) * d.percentage) / 100)),
    }));
    const refs = distributions.map((d) => bankRef(uid, d.bankId));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));

    snaps.forEach((snap, i) => {
      if (!snap.exists()) return;
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
