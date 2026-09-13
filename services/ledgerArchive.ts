import { collection, getDocsFromServer, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Activity } from '../types';

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
