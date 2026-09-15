import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Activity, Trade } from '../types';

/**
 * The part of the ledger the live feed does not read: records older than the
 * window, still waiting to be cleared.
 *
 * These are one-off reads, made only while the Statements screen is open — the
 * whole point of the window is that the app does not read them on every open.
 * They are read from the server, never the phone's cache: the screen records
 * that it showed everything before the cutoff, and a cache can be missing
 * records without saying so.
 */

const activitiesCol = (uid: string) => collection(db, 'users', uid, 'activities');

/**
 * How many past-the-window records one visit reads at most. Clearing runs a
 * little every open, so normally only a month or so is waiting; this bounds
 * the first visit of someone with years of history.
 */
export const OLDER_PAGE = 2000;

/** Records before the cutoff, oldest first; `complete` is false when the page was full. */
export const loadOlderThan = async (
  uid: string,
  cutoff: Date,
  max = OLDER_PAGE
): Promise<{ activities: Activity[]; complete: boolean }> => {
  const snap = await getDocsFromServer(
    query(activitiesCol(uid), where('date', '<', cutoff.toISOString()), orderBy('date', 'asc'), limit(max))
  );
  return {
    activities: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity),
    complete: snap.size < max,
  };
};

/** Whether any record sits in [from, to) — one document read. */
export const hasBetween = async (uid: string, from: Date, to: Date) => {
  const snap = await getDocsFromServer(
    query(
      activitiesCol(uid),
      where('date', '>=', from.toISOString()),
      where('date', '<', to.toISOString()),
      orderBy('date', 'asc'),
      limit(1)
    )
  );
  return !snap.empty;
};

/* ------------------------------------------------- inside the kept window */

/**
 * Kept records older than the live window, newest first — one read per record,
 * made only when a screen looks that far back (see OlderLedger).
 *
 * From the server, never the cache: the cache can hold some of a month without
 * saying so, and a total summed from part of a month is a wrong total. Offline
 * this throws and the screen says it cannot load rather than guessing.
 */
export const loadActivitiesBetween = async (uid: string, from: Date, to: Date): Promise<Activity[]> => {
  const snap = await getDocsFromServer(
    query(
      activitiesCol(uid),
      where('date', '>=', from.toISOString()),
      where('date', '<', to.toISOString()),
      orderBy('date', 'desc')
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity);
};

/**
 * One row as it stands now, or null when it is gone. A batch write lands in
 * the phone's cache straight away, so that is free to read; a transaction's
 * does not, so that one is read from the server.
 */
export const readActivity = async (uid: string, id: string, server = false): Promise<Activity | null> => {
  const ref = doc(db, 'users', uid, 'activities', id);
  const snap = server ? await getDocFromServer(ref) : await getDocFromCache(ref).catch(() => getDoc(ref));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Activity) : null;
};

/**
 * The History row a trade wrote, when it is older than the loaded ledger.
 * Correcting a trade undoes what its row says, so opening an old one without
 * its row would have undone the wrong amount — or refused a split sale.
 */
export const findTradeActivity = async (uid: string, trade: Trade): Promise<Activity | null> => {
  const money = trade.money;
  if (money && 'activityId' in money && money.activityId) {
    const found = await readActivityPreferServer(uid, money.activityId);
    if (found) return found;
  }
  const snap = await getDocs(query(activitiesCol(uid), where('tradeId', '==', trade.id), limit(1)));
  const d = snap.docs[0];
  return d ? ({ id: d.id, ...d.data() } as Activity) : null;
};

const readActivityPreferServer = async (uid: string, id: string) => {
  const snap = await getDoc(doc(db, 'users', uid, 'activities', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Activity) : null;
};
