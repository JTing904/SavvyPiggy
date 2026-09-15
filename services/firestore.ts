import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
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
  type Transaction,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import type { InvestSettings } from '../types';
import { planTradeMoney, stampOf, type MoneyChoice, type TradeMoneyProblem } from './tradeMoney';
import type { Activity, ActivityType, Alert, Dividend, Holding, Loan, NotificationPrefs, PiggyBank, SavingsSettings, Schedule, Snapshot, Trade, TradeMoney, AlertKind } from '../types';
import { allowedRetention } from './analytics';
import { UNCATEGORISED } from './categories';
import { dayStart, tradeTotalCents } from './holdings';
import type { LangChoice } from '../i18n';
import { m as messages } from '../i18n';
import { dividendsAfterChange, exchangeDay, type CreditedDividend, type DueDividend } from './dividends';
import { dueOccurrences, localDate, runStamp, scheduleDay } from './schedules';
import { fromCents, resplitDeposit, toCents } from './money';
import { archiveStrategy, isInSplit, outstandingCents, planDeposit, planGoalRemoval, planWithdrawal, type GoalMoneyChoice, type GoneShareChoice, type Movement } from './ledger';
import { DEFAULT_PREFS, DEFAULT_SAVINGS, milestoneAlerts, receiptAlert, type AlertDraft } from './alerts';
import { activityRowsChanged } from './ledgerEvents';
import { localKey, readLocal, writeLocal } from './localFlags';

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
const generalRef = (uid: string) => doc(db, 'users', uid, 'settings', 'general');
const investRef = (uid: string) => doc(db, 'users', uid, 'settings', 'invest');

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

/**
 * Creates users/{uid} on first sign-in; refreshes profile fields after that.
 *
 * Only when they changed. This used to read the document and write it again
 * on every open, just to move `updatedAt`. What was last written is kept on
 * the phone, so an unchanged profile costs nothing at all.
 */
export const ensureUserProfile = async (user: User) => {
  const profile = {
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
  };
  const key = localKey('profile', user.uid);
  const stamp = JSON.stringify(profile);
  if (readLocal(key) === stamp) return;

  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const saved = snap.data();
  const same =
    snap.exists() &&
    saved?.displayName === profile.displayName &&
    saved?.email === profile.email &&
    saved?.photoURL === profile.photoURL;
  if (!same) {
    await setDoc(
      ref,
      { ...profile, updatedAt: Date.now(), ...(snap.exists() ? {} : { createdAt: Date.now() }) },
      { merge: true }
    );
  }
  writeLocal(key, stamp);
};

/* ------------------------------------------------------------ subscriptions */

export const subscribeToBanks = (
  uid: string,
  onChange: (banks: PiggyBank[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(banksCol(uid), orderBy('createdAt', 'asc')),
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const bank = { id: d.id, ...d.data() } as PiggyBank;
          // Goals made with the old capitalised icon names (Celebration, School…)
          // rendered as words: the icon font only knows lowercase names.
          return typeof bank.icon === 'string' ? { ...bank, icon: bank.icon.toLowerCase() } : bank;
        })
      ),
    onError
  );

/**
 * The live end of the ledger: everything from `from` on (see liveWindowStart).
 *
 * A listener away for more than half an hour is billed as a fresh query, so
 * every open re-reads whatever this covers — and a free project allows fifty
 * thousand reads a day. It used to cover the whole kept window; now it covers
 * the last three months, and older kept records are read on demand.
 */
export const subscribeToActivities = (
  uid: string,
  from: Date,
  onChange: (activities: Activity[], fromCache: boolean) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe => {
  return onSnapshot(
    query(activitiesCol(uid), where('date', '>=', from.toISOString()), orderBy('date', 'desc')),
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

/**
 * How many alerts the bell reads. Every auto deposit leaves a receipt, so the
 * 90-day window alone could be hundreds of reads on each open; nobody scrolls
 * past the newest fifty.
 */
export const ALERTS_LIMIT = 50;

export const subscribeToAlerts = (
  uid: string,
  onChange: (alerts: Alert[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(
    query(alertsCol(uid), orderBy('date', 'desc'), limit(ALERTS_LIMIT)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Alert)),
    onError
  );

/** The ids of every dividend already paid in — one small read per open. */
export const subscribeToCreditedDividends = (
  uid: string,
  onChange: (credited: CreditedDividend[]) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(creditedCol(uid), (snap) => onChange(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as CreditedDividend)), onError);

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

/**
 * The language kept with the account, so a new phone signs in speaking it.
 * Read once per phone rather than listened to: it changes about never, and a
 * listener would be a read on every open for nothing. What the account holds
 * is remembered on the phone once read, and every save here updates that, so
 * later opens read nothing.
 */
const languageKey = (uid: string) => localKey('accountLanguage', uid);

const parseLanguage = (lang: unknown, at: unknown): LangChoice | null =>
  lang === 'en' || lang === 'zh' ? { lang, at: Number(at) || 0 } : null;

export const loadLanguage = async (uid: string): Promise<LangChoice | null> => {
  const remembered = readLocal(languageKey(uid));
  if (remembered !== null) {
    try {
      const v = JSON.parse(remembered) as { lang?: unknown; at?: unknown } | null;
      return v ? parseLanguage(v.lang, v.at) : null;
    } catch {
      // Unreadable: read the account again.
    }
  }
  const data = (await getDoc(generalRef(uid))).data();
  const choice = parseLanguage(data?.language, data?.languageAt);
  writeLocal(languageKey(uid), JSON.stringify(choice));
  return choice;
};

export const saveLanguage = (uid: string, choice: LangChoice) => {
  writeLocal(languageKey(uid), JSON.stringify(choice));
  return setDoc(generalRef(uid), { language: choice.lang, languageAt: choice.at }, { merge: true });
};

/* ------------------------------------------------------------------- banks */

export const createBank = async (uid: string, goal: Partial<PiggyBank>) => {
  const name = goal.name || messages().errors.newGoal;
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

/**
 * Deletes a goal and moves whatever it held — see planGoalRemoval. One batch:
 * the goal, each receiving balance, the handed-on split, and a single
 * "moved in" History row so the receiving goal's jump in balance can be read.
 */
export const deleteBank = async (
  uid: string,
  banks: PiggyBank[],
  id: string,
  choice: GoalMoneyChoice | null,
  savings: SavingsSettings = DEFAULT_SAVINGS,
  /** Auto deposits aimed at this goal, and where they save from now on (null: auto split). */
  retarget: { scheduleIds: string[]; target: string | null } | null = null
) => {
  const result = planGoalRemoval(banks, id, choice, savings.overflow);
  if ('problem' in result) throw new Error(messages().errors.goalRemoval[result.problem]);
  const { cents, movements, strategy } = result.plan;
  const target = banks.find((b) => b.id === id);

  const batch = writeBatch(db);
  for (const bank of strategy) {
    const before = banks.find((b) => b.id === bank.id);
    if (before && before.splitPercentage !== bank.splitPercentage) {
      batch.update(bankRef(uid, bank.id), { splitPercentage: bank.splitPercentage });
    }
  }
  movements.forEach((m) => batch.update(bankRef(uid, m.bankId), { currentAmount: increment(fromCents(m.cents)) }));
  if (cents !== 0) {
    batch.set(doc(activitiesCol(uid)), {
      type: 'transfer' satisfies ActivityType,
      date: new Date().toISOString(),
      amount: fromCents(Math.abs(cents)),
      distributions: toDistributions(movements),
      fromGoal: target?.name ?? '',
      fromGoalId: id,
    });
  }
  // Auto deposits aimed at this goal would otherwise write to a goal that is
  // gone, and a failed write stopped every auto deposit after it.
  if (retarget) {
    if (retarget.target && !strategy.some((b) => b.id === retarget.target && !b.archivedAt)) {
      throw new Error(messages().errors.goalRemoval.noDestination);
    }
    retarget.scheduleIds.forEach((sid) => batch.update(scheduleRef(uid, sid), { targetBankId: retarget.target }));
  }
  batch.delete(bankRef(uid, id));
  await batch.commit();
};

/**
 * Puts a finished goal away. Its money and its history stay exactly where they
 * are — only the strategy changes, because the share it was taking is passed
 * to the goals still saving rather than quietly going nowhere.
 */
export const archiveBank = async (
  uid: string,
  banks: PiggyBank[],
  id: string,
  /** Auto deposits aimed at this goal, and where they save from now on (null: auto split). */
  retarget: { scheduleIds: string[]; target: string | null } | null = null
) => {
  const next = archiveStrategy(banks, id);
  const batch = writeBatch(db);
  retarget?.scheduleIds.forEach((sid) => batch.update(scheduleRef(uid, sid), { targetBankId: retarget.target }));

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
    throw new Error(messages().errors.nothingToDepositInto);
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

    /*
      Relative, not absolute.

      This used to write `outstanding` as a figure worked out from a loan read
      off React state before the write began. Two writers planning against the
      same snapshot then overwrote each other: a RM60 repayment and a RM50 one
      against a RM100 debt left it at RM50, so RM110 of income went to clearing
      a debt that only fell by RM50. Goal balances already used increments and
      were never affected; loans were the one place still doing arithmetic on
      a stale value.
    */
  plan.repayments.forEach((r) => {
    const left = outstandingCents(r.loan) - r.cents;
    batch.update(loanRef(uid, r.loan.id), {
      outstanding: increment(-fromCents(r.cents)),
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
  if (movements.length === 0) throw new Error(messages().errors.enterWithdrawAmount);

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
  if (cents <= 0) throw new Error(messages().errors.enterSpendAmount);

  // One batch, with the loan's id made on the phone. Two awaited addDocs waited
  // for the server between them, so offline the debt was queued and the
  // History row that explains it never was.
  const loan = doc(loansCol(uid));
  const batch = writeBatch(db);
  batch.set(loan, {
    amount: fromCents(cents),
    outstanding: fromCents(cents),
    note,
    sources: [],
    createdAt: Date.now(),
    settledAt: null,
  });
  batch.set(doc(activitiesCol(uid)), {
    type: 'borrow' satisfies ActivityType,
    date: new Date().toISOString(),
    amount: fromCents(cents),
    distributions: [],
    loanId: loan.id,
    note,
  });
  await batch.commit();
};

/** Re-labelling a past entry. Touches no balance, so it needs no transaction. */
export const setActivityCategory = (uid: string, id: string, category: string) => {
  const written = updateDoc(activityRef(uid, id), { category });
  // Already in the phone's cache, so an older row on screen can follow it.
  activityRowsChanged([{ id }]);
  return written;
};

/** Removes an activity and reverses its movements, never below zero. */
/**
 * Removing one entry from the ledger, and everything it did.
 *
 * The hard case is spending that has since been covered. Spend RM5 without
 * picking a goal and the app records a debt; the next deposit clears it, so
 * RM5 of that deposit never reaches the goals. Deleting the spending then has
 * to answer for that RM5 — and it used to just drop the debt and walk away,
 * leaving the goals short by exactly the amount already covered while the
 * confirmation promised the money was going back.
 *
 * It goes back by correcting the deposit that covered it, not by inventing a
 * second entry. Only one deposit ever happened, so the ledger should go on
 * showing one: the same RM5, now landing in the goals instead of paying off a
 * debt that no longer exists. Adding a separate "returned" row alongside the
 * original made the day read as RM10 of income.
 *
 * `covering` is the deposits that repaid this entry's debt, found in the
 * loaded ledger by the caller.
 */
export const deleteActivity = (
  uid: string,
  shown: Activity,
  banks: PiggyBank[] = [],
  savings: SavingsSettings = DEFAULT_SAVINGS,
  shownCovering: Activity[] = [],
  /** Where the share of a goal deleted since is settled — see GoneShareChoice. */
  takeBack?: GoneShareChoice
) =>
  runTransaction(db, async (tx) => {
    // What is undone is the record as it stands, not the copy on screen: an
    // older row is not listened to, so another device may have edited or
    // deleted it since, and undoing the stale copy would move the money twice.
    const activity = await readRow(tx, uid, shown.id);
    if (!activity) throw new Error(messages().errors.recordGone);
    // The same goes for the deposits that covered it; one cleared since has nothing left to correct.
    const covering = activity.loanId
      ? (await Promise.all(shownCovering.map((paid) => readRow(tx, uid, paid.id)))).filter((a): a is Activity => a !== null)
      : [];

    const refs = activity.distributions.map((d) => bankRef(uid, d.bankId));
    // Every read has to happen before the first write.
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));

    // A deleted goal's share was handed on when the goal went, so undoing it
    // is settled against the goal the person picked, or nowhere.
    const gone = snaps.reduce((sum, snap, i) => (snap.exists() ? sum : sum + toCents(activity.distributions[i].amount)), 0);
    const settle = gone !== 0 && takeBack?.mode === 'goal' ? bankRef(uid, takeBack.goalId) : null;
    if (gone !== 0 && !takeBack) throw new Error(messages().errors.goneShare);
    const settleSnap = settle ? await tx.get(settle) : null;
    if (settleSnap && !settleSnap.exists()) throw new Error(messages().errors.goalRemoval.noDestination);
    // A debt this entry paid down may have been removed since; updating a
    // missing document would fail the whole undo.
    const repaidLoans = await Promise.all((activity.repayments ?? []).map((r) => tx.get(loanRef(uid, r.loanId))));

    // Spent ahead that was already covered: that money goes back to the goals.
    // If the split cannot place all of it (no goal takes a share, or the shares
    // add up to less than 100), undoing would make it vanish — so refuse first.
    const coveredPlans = activity.loanId
      ? covering.flatMap((paid) => {
          const back = toCents(paid.repayments?.find((r) => r.loanId === activity.loanId)?.amount ?? 0);
          return back > 0 ? [{ paid, back, plan: planDeposit(back, banks, [], null, savings.overflow) }] : [];
        })
      : [];
    if (coveredPlans.some(({ back, plan }) => plan.movements.reduce((s, m) => s + m.cents, 0) < back)) {
      throw new Error(messages().errors.coveredNowhere);
    }

    // One write per goal: the picked goal can be one the record also touched,
    // and two updates worked out from the same read would overwrite each other.
    const next = new Map<string, number>();
    const move = (id: string, balance: number, cents: number) => next.set(id, (next.get(id) ?? toCents(balance)) + cents);
    snaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      // Distributions are signed, so subtracting undoes deposits and
      // withdrawals alike.
      move(refs[i].id, snap.data().currentAmount ?? 0, -toCents(activity.distributions[i].amount));
    });
    if (settle && settleSnap?.exists()) move(settle.id, settleSnap.data().currentAmount ?? 0, -gone);
    next.forEach((cents, id) => tx.update(bankRef(uid, id), { currentAmount: fromCents(cents) }));

    // Undoing a repayment puts the debt back.
    activity.repayments?.forEach((r, i) => {
      if (repaidLoans[i]?.exists()) tx.update(loanRef(uid, r.loanId), { outstanding: increment(r.amount), settledAt: null });
    });

    if (activity.loanId) {
      // Where that money should have gone. No loans passed: this is the
      // debt disappearing, not a new deposit arriving to pay one off.
      for (const { paid, back, plan } of coveredPlans) {
        const merged = paid.distributions.map((d) => ({ ...d }));
        for (const m of plan.movements) {
          tx.update(bankRef(uid, m.bankId), { currentAmount: increment(fromCents(m.cents)) });
          const existing = merged.find((d) => d.bankId === m.bankId);
          if (existing) existing.amount = fromCents(toCents(existing.amount) + m.cents);
          else merged.push({ bankId: m.bankId, amount: fromCents(m.cents), percentage: m.percentage });
        }

        tx.update(activityRef(uid, paid.id), {
          distributions: merged,
          repaid: fromCents(Math.max(0, toCents(paid.repaid ?? 0) - back)),
          repayments: (paid.repayments ?? []).filter((r) => r.loanId !== activity.loanId),
        });
      }
      tx.delete(loanRef(uid, activity.loanId));
    }

    tx.delete(activityRef(uid, activity.id));
  }).then(() =>
    // A transaction does not update the phone's cache, so rows it rewrote are read back.
    activityRowsChanged([
      { id: shown.id, deleted: true },
      ...(shown.loanId ? shownCovering.map((paid) => ({ id: paid.id, server: true })) : []),
    ])
  );

/** One ledger row read inside a transaction, or null when it is gone. */
const readRow = async (tx: Transaction, uid: string, id: string): Promise<Activity | null> => {
  const snap = await tx.get(activityRef(uid, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Activity) : null;
};

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
export const editActivity = (uid: string, shown: Activity, newAmount: number) =>
  runTransaction(db, async (tx) => {
    // Rewritten from the record as it stands, not the copy on screen — see deleteActivity.
    const activity = await readRow(tx, uid, shown.id);
    if (!activity) throw new Error(messages().errors.recordGone);
    if (activity.repaid || (activity.repayments?.length ?? 0) > 0) {
      throw new Error(messages().errors.editRepaidDebt);
    }
    // Zero would leave an entry that moved nothing; taking it back is what delete is for.
    if (toCents(newAmount) <= 0) throw new Error(messages().errors.editAmountPositive);

    const cents = resplitDeposit(toCents(newAmount), toCents(activity.amount), activity.distributions);
    const distributions = activity.distributions.map((d, i) => ({ ...d, amount: fromCents(cents[i]) }));

    const refs = distributions.map((d) => bankRef(uid, d.bankId));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));

    const missing = snaps.findIndex((snap) => !snap.exists());
    if (missing >= 0) {
      throw new Error(messages().errors.editDeletedGoal);
    }

    snaps.forEach((snap, i) => {
      const delta = toCents(distributions[i].amount) - toCents(activity.distributions[i].amount);
      const next = toCents(snap.data().currentAmount ?? 0) + delta;
      tx.update(refs[i], { currentAmount: fromCents(next) });
    });
    tx.update(activityRef(uid, activity.id), { amount: fromCents(toCents(newAmount)), distributions });
  }).then(() => activityRowsChanged([{ id: shown.id, server: true }]));

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

/**
 * Alerts older than `before` that the bell never read, because only the newest
 * ALERTS_LIMIT are listened to. Bounded: whatever is left goes next session.
 */
export const pruneAlertsBefore = async (uid: string, before: Date) => {
  const snap = await getDocs(
    query(alertsCol(uid), where('date', '<', before.toISOString()), orderBy('date', 'asc'), limit(400))
  );
  await pruneAlerts(uid, snap.docs.map((d) => d.id));
};

/* ------------------------------------------------------------------ trades */

/**
 * Positions are not stored. This log is, and the position is replayed from it,
 * so a trade entered wrong is fixed by fixing that one trade rather than by
 * overwriting a total and losing the history a dividend depends on.
 */
export const DEFAULT_INVEST: InvestSettings = {
  brokerId: null,
  customRule: null,
  watchlist: [],
  style: null,
  typeOverrides: {},
  feePromptAt: 0,
  potBalance: 0,
};

export const subscribeToInvest = (
  uid: string,
  onChange: (settings: InvestSettings) => void,
  onError: (e: FirestoreError) => void
): Unsubscribe =>
  onSnapshot(investRef(uid), (snap) => onChange({ ...DEFAULT_INVEST, ...(snap.data() ?? {}) } as InvestSettings), onError);

export const saveInvest = (uid: string, patch: Partial<InvestSettings>) => setDoc(investRef(uid), patch, { merge: true });

/** Why a trade's money could not move, carried to the screen that has to ask about it. */
export class TradeMoneyError extends Error {
  constructor(readonly problem: TradeMoneyProblem) {
    super(messages().errors.tradeMoney[problem.kind]);
  }
}

/** Firestore rejects undefined; an absent optional field is simply left out. */
const defined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

export interface TradeWrite {
  /** The trade being corrected or deleted, with the History row it wrote. Null when recording. */
  previous: { trade: Trade; activity: Activity | null } | null;
  /** What the trade is now; null deletes it. */
  trade: Omit<Trade, 'id' | 'createdAt' | 'money'> | null;
  choice: MoneyChoice;
  refund?: MoneyChoice;
  /** Where a sale's share in a since-deleted goal is taken back from. */
  takeBack?: GoneShareChoice;
  banks: PiggyBank[];
  /** Every debt, settled ones included — undoing a sale can reopen one. */
  loans: Loan[];
  savings?: SavingsSettings;
  /** The investment pot's balance now, in ringgit. */
  potBalance?: number;
  /**
   * The whole log, the dividends already paid in and the announcements: with
   * them, dividends already paid into the pot are corrected by what this
   * change does to the units they were owed on (see reconcileDividends).
   */
  trades?: Trade[];
  credited?: CreditedDividend[];
  dividends?: Dividend[];
  /** Alerts on the phone, so a corrected dividend's alert is only touched if it still exists. */
  alertIds?: string[];
}

/**
 * Recording, correcting or deleting a buy or sale, with the money it moves.
 *
 * One batch, so it goes through offline like a deposit does, and either all of
 * it lands or none of it: the trade, each goal's balance, any debt a sale
 * covered, and the single History row. Goals move by increments, never by
 * figures worked out from a snapshot.
 *
 * Not async: a problem with the money is thrown straight away, and the write
 * is handed back as `committed` rather than awaited. Offline, a commit only
 * settles once the server confirms it — awaiting it kept the sheet spinning
 * with the change already applied on the phone, and a second tap recorded the
 * trade twice.
 */
export const saveTrade = (uid: string, w: TradeWrite) => {
  const next = w.trade;
  const ref = w.previous ? tradeRef(uid, w.previous.trade.id) : doc(tradesCol(uid));
  const createdAt = w.previous?.trade.createdAt ?? Date.now();
  const adjust =
    w.trades && w.credited
      ? dividendsAfterChange({
          trades: w.trades,
          credited: w.credited,
          dividends: w.dividends ?? [],
          previousId: w.previous?.trade.id ?? null,
          next: next ? { ...next, id: ref.id, createdAt, tradedAt: dayStart(next.tradedAt), money: stampOf(w.choice) } : null,
        })
      : { deltaCents: 0, changes: [] };
  const result = planTradeMoney({
    previous: w.previous,
    next:
      next && (next.kind === 'buy' || next.kind === 'sell')
        ? { kind: next.kind, totalCents: tradeTotalCents(next), choice: w.choice, counter: next.name || next.symbol, units: next.units }
        : null,
    banks: w.banks,
    loans: w.loans,
    overflow: (w.savings ?? DEFAULT_SAVINGS).overflow,
    refund: w.refund,
    takeBack: w.takeBack,
    potCents: toCents(w.potBalance ?? 0),
    dividendDeltaCents: adjust.deltaCents,
  });
  if ('problem' in result) throw new TradeMoneyError(result.problem);
  const { plan } = result;

  const now = new Date();
  const batch = writeBatch(db);

  let activityId: string | null = null;
  switch (plan.activity.write) {
    case 'create': {
      const aRef = doc(activitiesCol(uid));
      activityId = aRef.id;
      batch.set(aRef, { ...plan.activity.draft, date: now.toISOString(), tradeId: ref.id });
      break;
    }
    case 'update':
      activityId = plan.activity.id;
      batch.update(activityRef(uid, plan.activity.id), { ...plan.activity.draft, tradeId: ref.id });
      break;
    case 'delete':
      batch.delete(activityRef(uid, plan.activity.id));
      break;
    case 'replace': {
      // Deleting a row that retention already cleared is harmless; updating it would fail the batch.
      batch.delete(activityRef(uid, plan.activity.oldId));
      const aRef = doc(activitiesCol(uid));
      activityId = aRef.id;
      batch.set(aRef, { ...plan.activity.draft, date: now.toISOString(), tradeId: ref.id });
      break;
    }
  }

  if (plan.potDelta !== 0) batch.set(investRef(uid), { potBalance: increment(fromCents(plan.potDelta)) }, { merge: true });
  for (const [bankId, cents] of Object.entries(plan.bankDeltas)) {
    batch.update(bankRef(uid, bankId), { currentAmount: increment(fromCents(cents)) });
  }
  for (const [loanId, cents] of Object.entries(plan.loanDeltas)) {
    batch.update(loanRef(uid, loanId), {
      outstanding: increment(fromCents(cents)),
      settledAt: plan.loanOutstanding[loanId] === 0 ? now.toISOString() : null,
    });
  }

  if (next) {
    const money = plan.money && 'activityId' in plan.money ? { ...plan.money, activityId: activityId ?? '' } : plan.money;
    batch.set(
      ref,
      defined({
        ...next,
        tradedAt: dayStart(next.tradedAt),
        createdAt,
        money: money ?? { mode: 'none' },
      }) as Record<string, unknown>
    );
  } else {
    batch.delete(ref);
  }

  // Dividends already paid in, moved by what this change did to their units.
  // The pot's side is already in plan.potDelta; only markers that change are written.
  const alertIds = new Set(w.alertIds ?? []);
  const alertFixes: { id: string; units: number; amount: number }[] = [];
  for (const change of adjust.changes) {
    const marker = w.credited?.find((c) => c.id === change.id);
    batch.set(
      creditedRef(uid, change.id),
      {
        units: change.units,
        amountCents: change.amountCents,
        perUnitPoints: change.perUnitPoints,
        payDate: change.payDate,
        pot: true,
        adjustedAt: now.toISOString(),
      },
      { merge: true }
    );
    const row = w.trades?.find((t) => t.id === change.id && t.kind === 'dividend');
    const alertId = `dividend_${change.id}`;
    if (change.units === 0) {
      // Nothing was owed after all: the receipt goes, the marker stays so it is never paid again.
      if (row) batch.delete(tradeRef(uid, change.id));
      if (alertIds.has(alertId)) batch.delete(alertRef(uid, alertId));
      continue;
    }
    if (alertIds.has(alertId)) alertFixes.push({ id: alertId, units: change.units, amount: fromCents(change.amountCents) });
    if (row) {
      batch.update(tradeRef(uid, change.id), { units: change.units });
    } else if ((marker?.units ?? 0) === 0) {
      // Taken back to nothing by an earlier correction, which removed its row; owed again now.
      batch.set(tradeRef(uid, change.id), {
        symbol: change.symbol,
        name: w.trades?.find((t) => t.symbol === change.symbol)?.name ?? change.symbol,
        kind: 'dividend' satisfies Trade['kind'],
        units: change.units,
        priceCents: 0,
        perUnitPoints: change.perUnitPoints,
        exDate: change.exDate,
        tradedAt: exchangeDay(change.payDate),
        createdAt: Date.now(),
        money: { mode: 'pot' } satisfies TradeMoney,
      });
    }
  }

  const committed = batch.commit();
  // An alert's figures are cosmetic, so they are corrected outside the batch:
  // updating one another device has since cleared would refuse the whole
  // batch, trade and pot with it. Deleting a missing one is harmless, so that stays in.
  alertFixes.forEach(({ id, ...fields }) => void updateDoc(alertRef(uid, id), fields).catch(() => undefined));
  // The batch is already in the phone's cache; an older History row on screen follows it.
  const touched =
    plan.activity.write === 'replace'
      ? plan.activity.oldId
      : plan.activity.write === 'update' || plan.activity.write === 'delete'
        ? plan.activity.id
        : null;
  if (touched) activityRowsChanged([{ id: touched }]);
  return { id: ref.id, plan, committed };
};

/**
 * Positions recorded before the log existed carried a total and no history.
 * Each becomes a single opening buy on the day it was first entered, which is
 * the most that can honestly be said about when those units were acquired —
 * the real dates were never asked for. Runs once: the old row is removed in
 * the same batch, so a second run finds nothing to do.
 */
export const migrateHoldingsToTrades = async (uid: string) => {
  // From the server only: the caller remembers "done" once this resolves, and
  // an empty offline cache would have said there was nothing to move.
  const snap = await getDocsFromServer(legacyHoldingsCol(uid));
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
 * Paying a dividend into the investment pot, on the day it lands.
 *
 * Dividends are income from the shares, so they stay on the investing side: the
 * pot grows and nothing in savings moves. The app records it rather than the
 * user, so two things are true of this function:
 *
 * It runs inside a transaction keyed on the dividend's own id, so opening the
 * app on two phones, or twice in a minute, credits it once.
 *
 * And it writes the trade with the units it was worked out on, so the log
 * shows how the figure was reached. Companies deduct tax and fees, so the
 * amount that lands is often not the amount announced — the alert says to check it.
 */
export const creditDividend = async (uid: string, due: DueDividend, name: string) => {
  const { dividend, units, amountCents } = due;
  // The id comes with the due dividend: a second payment on the same ex-date
  // carries a suffix, while the first keeps the id it was always paid under.
  const id = due.id;
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
      tradedAt: exchangeDay(dividend.payDate),
      createdAt: Date.now(),
      money: { mode: 'pot' } satisfies TradeMoney,
    });

    tx.set(investRef(uid), { potBalance: increment(fromCents(amountCents)) }, { merge: true });

    // The marker the guard above reads, in the same transaction as the money:
    // either the money moved and this says so, or neither happened.
    tx.set(creditedRef(uid, id), {
      creditedAt: now.toISOString(),
      symbol: dividend.symbol,
      exDate: dividend.exDate,
      payDate: dividend.payDate,
      perUnitPoints: dividend.perUnitPoints,
      units,
      amountCents,
      // Into the pot: a later correction to the trades may move it, through the pot.
      pot: true,
    });

    tx.set(alertRef(uid, `dividend_${id}`), {
      kind: 'dividend' satisfies AlertKind,
      date: now.toISOString(),
      read: false,
      counter: name,
      units,
      amount: fromCents(amountCents),
    });

    return { amountCents, units };
  });
};

/* ---------------------------------------------------------- investment pot */

/**
 * Savings into the investment pot. Not spending: the money only changes side,
 * so History records it as its own kind of row. A goal can't hand over more
 * than it holds — this is a move, not a spend ahead.
 */
export const transferToPot = (uid: string, banks: PiggyBank[], goalId: string, cents: number) => {
  const bank = banks.find((b) => b.id === goalId && !b.archivedAt);
  if (!bank) throw new Error(messages().errors.goalRemoval.noDestination);
  if (cents <= 0) throw new Error(messages().errors.enterAmount);
  if (toCents(bank.currentAmount) < cents) throw new Error(messages().errors.potFromShort(bank.name));

  const batch = writeBatch(db);
  batch.update(bankRef(uid, goalId), { currentAmount: increment(-fromCents(cents)) });
  batch.set(investRef(uid), { potBalance: increment(fromCents(cents)) }, { merge: true });
  batch.set(doc(activitiesCol(uid)), {
    type: 'toInvest' satisfies ActivityType,
    date: new Date().toISOString(),
    amount: fromCents(cents),
    distributions: [{ bankId: goalId, amount: -fromCents(cents), percentage: 100 }],
  });
  return batch.commit();
};

/**
 * The investment pot back into savings: one goal, or split by the strategy.
 * It is not new income, so it does not clear spent ahead; a split under 100%
 * still places every sen, the leftover going to the biggest share.
 */
export const transferFromPot = (
  uid: string,
  banks: PiggyBank[],
  potBalance: number,
  target: string | null,
  cents: number,
  savings: SavingsSettings = DEFAULT_SAVINGS
) => {
  if (cents <= 0) throw new Error(messages().errors.enterAmount);
  if (toCents(potBalance) < cents) throw new Error(messages().errors.potShort);
  const movements = planDeposit(cents, banks.filter((b) => !b.archivedAt), [], target, savings.overflow).movements.filter(
    (m) => m.cents !== 0
  );
  if (movements.length === 0) throw new Error(messages().errors.goalRemoval.noDestination);
  const placed = movements.reduce((sum, m) => sum + m.cents, 0);
  if (placed < cents) movements.reduce((a, b) => (b.percentage > a.percentage ? b : a)).cents += cents - placed;

  const batch = writeBatch(db);
  movements.forEach((m) => batch.update(bankRef(uid, m.bankId), { currentAmount: increment(fromCents(m.cents)) }));
  batch.set(investRef(uid), { potBalance: increment(-fromCents(cents)) }, { merge: true });
  batch.set(doc(activitiesCol(uid)), {
    type: 'fromInvest' satisfies ActivityType,
    date: new Date().toISOString(),
    amount: fromCents(cents),
    distributions: toDistributions(movements),
  });
  return batch.commit();
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

/**
 * Changing a rule. Anything that alters *when* it fires restarts its clock.
 *
 * A paused rule never advances `lastRunAt`, because the catch-up skips it —
 * so switching one back on used to hand `dueOccurrences` every day since the
 * pause and post them all as real deposits. Pause a daily RM10 rule for three
 * months, turn it on, and the next app open credited sixty deposits of money
 * that was never saved. Changing the frequency did the same thing sideways: a
 * monthly rule switched to daily backfilled every day since its last monthly
 * run.
 *
 * The screen already promises the change "applies from the next occurrence
 * and never backwards". This is what makes that true. Editing only the amount
 * leaves the clock alone, so correcting a figure still does not repost.
 */
const RESCHEDULES: (keyof Schedule)[] = ['frequency', 'weekday', 'dayOfMonth', 'month'];

export const updateSchedule = (uid: string, id: string, patch: Partial<Schedule>) => {
  const restarts =
    patch.enabled === true || RESCHEDULES.some((key) => patch[key] !== undefined);
  return updateDoc(scheduleRef(uid, id), {
    ...patch,
    ...(restarts ? { lastRunAt: new Date().toISOString() } : {}),
  });
};

export const deleteSchedule = (uid: string, id: string) => deleteDoc(scheduleRef(uid, id));

/**
 * A rule with nowhere to put its money is treated like a paused one.
 *
 * It used to simply stop and leave lastRunAt where it was, so the moment a
 * strategy was set every run missed in between was posted at once — weeks of
 * deposits of money that had never been set aside. Runs that could not be
 * placed are now passed over without posting, and saving resumes from the day
 * a goal takes a share.
 *
 * Skipping loses deposits for good, so it is only done on the server's word:
 * the goals on screen can be the phone's stale copy from before a strategy was
 * saved elsewhere. Offline the read fails and the rule simply waits, as before.
 */
const skipWaitingRuns = async (
  uid: string,
  schedule: Schedule,
  seen: string | null,
  through: string,
  openLoans: Loan[],
  savings: SavingsSettings
) => {
  const server = await getDocsFromServer(banksCol(uid));
  const banks = server.docs.map((d) => ({ id: d.id, ...d.data() }) as PiggyBank);
  const plan = planDeposit(toCents(schedule.amount), banks, openLoans, schedule.targetBankId, savings.overflow);
  // The server has somewhere for it after all; the listener catches up and the next pass posts.
  if (plan.movements.length > 0 || plan.repayments.length > 0) return;

  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(scheduleRef(uid, schedule.id));
    if (!fresh.exists() || fresh.data().enabled === false) return;
    // Moved on since this pass read it: another device is already dealing with it.
    if (scheduleDay(fresh.data().lastRunAt ?? 0) !== seen) return;
    tx.update(scheduleRef(uid, schedule.id), { lastRunAt: runStamp(through) });
  });
};

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
  let aimedAtNothing = 0;

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    // Aimed at a goal deleted before deleting asked about auto deposits: the
    // write would fail and take every later schedule down with it. The others
    // post first; this one is still reported once they have.
    // An archived goal counts as gone here too: it is put away and takes no new money.
    if (schedule.targetBankId && !banks.some((b) => b.id === schedule.targetBankId && !b.archivedAt)) {
      aimedAtNothing += 1;
      continue;
    }

    const due = dueOccurrences(schedule);
    let seen = scheduleDay(schedule.lastRunAt);
    for (const day of due) {
      const when = localDate(day);
      const plan = planDeposit(toCents(schedule.amount), liveBanks, openLoans, schedule.targetBankId, savings.overflow);
      // Nothing allocated and no debt to clear: the rule waits for a strategy.
      if (plan.movements.length === 0 && plan.repayments.length === 0) {
        await skipWaitingRuns(uid, schedule, seen, due[due.length - 1], openLoans, savings);
        break;
      }

      // A transaction, not a batch: it re-reads the rule on the server first. Two
      // devices opening on the same day each saw the rule as not yet run — one
      // of them from its own out-of-date cache — and both posted the deposit.
      // Compared as Malaysian days, so a phone in another zone agrees on which.
      const entry = doc(activitiesCol(uid));
      const done = await runTransaction(db, async (tx) => {
        const fresh = await tx.get(scheduleRef(uid, schedule.id));
        if (!fresh.exists() || fresh.data().enabled === false) return false;
        const last = scheduleDay(fresh.data().lastRunAt ?? 0);
        if (last === null || last >= day) return false;
        tx.set(entry, {
          type: 'auto-save' satisfies ActivityType,
          date: when.toISOString(),
          amount: fromCents(toCents(schedule.amount)),
          distributions: toDistributions(plan.movements),
          repaid: fromCents(plan.repaidCents),
          repayments: plan.repayments.map((r) => ({ loanId: r.loan.id, amount: fromCents(r.cents) })),
        });
        plan.movements.forEach((m) =>
          tx.update(bankRef(uid, m.bankId), { currentAmount: increment(fromCents(m.cents)) })
        );
        plan.repayments.forEach((r) => {
          const left = outstandingCents(r.loan) - r.cents;
          tx.update(loanRef(uid, r.loan.id), {
            outstanding: increment(-fromCents(r.cents)),
            settledAt: left === 0 ? when.toISOString() : null,
          });
        });
        tx.update(scheduleRef(uid, schedule.id), { lastRunAt: runStamp(day) });

        const drafts: AlertDraft[] = [];
        if (alerts.receipts) drafts.push(receiptAlert(entry.id, toCents(schedule.amount), liveBanks, plan.movements, when));
        if (alerts.milestones) drafts.push(...milestoneAlerts(liveBanks, plan.movements, when, savings.overflow));
        drafts.forEach(({ id, ...rest }) => tx.set(alertRef(uid, id), { ...rest, read: false }));
        return true;
      });
      // Another device got there first; this rule is up to date.
      if (!done) break;
      posted += 1;
      seen = day;
      // Back-dated, so it can land inside older rows already read; a transaction
      // leaves the phone's cache alone, so the row is read back from the server.
      activityRowsChanged([{ id: entry.id, server: true }]);

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
  if (aimedAtNothing > 0) throw new Error(messages().errors.scheduleGoalGone(aimedAtNothing));
  return posted;
};

/* ------------------------------------------------------------ sample data */

// Named in the language chosen when they are created; after that they are the person's to rename.
const sampleBanks = () => [
  { name: messages().errors.sampleGoals.vacation, targetAmount: 5000, splitPercentage: 30, icon: 'beach_access' },
  { name: messages().errors.sampleGoals.emergencyFund, targetAmount: 10000, splitPercentage: 50, icon: 'shield_with_heart' },
  { name: messages().errors.sampleGoals.newTech, targetAmount: 2000, splitPercentage: 20, icon: 'devices' },
];

/** Three empty starter goals adding up to 100%, for trying the app out. */
export const seedSampleBanks = async (uid: string) => {
  const batch = writeBatch(db);
  sampleBanks().forEach((b, i) =>
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
